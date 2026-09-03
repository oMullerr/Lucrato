import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Firestore, doc, onSnapshot, setDoc } from '@angular/fire/firestore';
import type { Unsubscribe } from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { logError } from './logger';
import type { EntradaCalculo, ResultadoCalculo } from '../pricing/pricing';

/** Uma análise guardada, para comparar depois ou revisar a decisão. */
export interface AnaliseSalva {
  id: string;
  /** Nome do produto analisado. */
  titulo: string;
  /** Anúncio consultado, quando a análise veio de um link. */
  mlItemId?: string;
  entrada: EntradaCalculo;
  /** Fotografia do resultado no momento em que foi salva. */
  resultado: Pick<ResultadoCalculo, 'lucroLiquido' | 'margemContribuicao' | 'roi'>;
  criadoEm: string;
}

/** Teto do documento, alinhado com a validação das security rules. */
const MAX_ANALISES = 2000;

/**
 * Histórico da calculadora.
 *
 * Vive em `users/{uid}/db/analyses`, documento separado do principal de
 * propósito: análise é rascunho de decisão, não faz parte do razão, e não
 * deve disputar gravação com compras e vendas.
 */
@Injectable({ providedIn: 'root' })
export class AnalysesService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  private readonly _analises = signal<AnaliseSalva[] | null>(null);
  private _unsub?: Unsubscribe;

  /** Mais recentes primeiro. `null` antes da primeira leitura. */
  readonly analises = computed(() => this._analises());
  readonly loaded = computed(() => this._analises() !== null);

  constructor() {
    effect(() => {
      const u = this.auth.currentUser();
      if (u?.uid) this.watch(u.uid);
      else if (u === null) this.stop();
    }, { allowSignalWrites: true });
  }

  private watch(uid: string): void {
    this._unsub?.();
    this._unsub = onSnapshot(
      doc(this.firestore, `users/${uid}/db/analyses`),
      snap => {
        const lista = (snap.data()?.['analyses'] ?? []) as AnaliseSalva[];
        this._analises.set(
          [...lista].sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? '')),
        );
      },
      err => {
        logError('[Analyses] onSnapshot falhou:', err);
        this._analises.set([]);
      },
    );
  }

  private stop(): void {
    this._unsub?.();
    this._unsub = undefined;
    this._analises.set(null);
  }

  private async gravar(lista: AnaliseSalva[]): Promise<void> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return;
    await setDoc(
      doc(this.firestore, `users/${uid}/db/analyses`),
      { analyses: lista.slice(0, MAX_ANALISES) },
      { merge: true },
    );
  }

  async salvar(analise: Omit<AnaliseSalva, 'id' | 'criadoEm'>): Promise<void> {
    const atuais = this._analises() ?? [];
    const nova: AnaliseSalva = {
      ...analise,
      id: `A${Date.now().toString(36)}`,
      criadoEm: new Date().toISOString(),
    };
    await this.gravar([nova, ...atuais]);
  }

  async remover(id: string): Promise<void> {
    const atuais = this._analises() ?? [];
    await this.gravar(atuais.filter(a => a.id !== id));
  }
}
