/**
 * Tipos da API de extensão, só o que esta extensão usa.
 *
 * Escrito à mão em vez de trazer `@types/chrome`: a integração inteira segue a
 * regra de manter a árvore de dependências curta, e são poucas chamadas.
 */
declare namespace chrome {
  namespace runtime {
    const lastError: { message?: string } | undefined;

    function sendMessage<Req = unknown, Res = unknown>(mensagem: Req): Promise<Res>;

    interface MessageSender {
      tab?: tabs.Tab;
      url?: string;
      origin?: string;
    }

    const onMessage: {
      addListener(
        ouvinte: (
          mensagem: unknown,
          remetente: MessageSender,
          responder: (resposta?: unknown) => void,
        ) => boolean | void,
      ): void;
    };
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      active?: boolean;
    }

    function query(consulta: { url?: string | string[] }): Promise<Tab[]>;
    function sendMessage<Req = unknown, Res = unknown>(
      tabId: number,
      mensagem: Req,
    ): Promise<Res>;
  }

  namespace storage {
    interface Area {
      get(chaves: string | string[] | null): Promise<Record<string, unknown>>;
      set(itens: Record<string, unknown>): Promise<void>;
      remove(chaves: string | string[]): Promise<void>;
    }

    /** Some quando o navegador fecha — é onde o token de identidade fica. */
    const session: Area;
    /** Sobrevive ao fechamento — só os números que você digitou. */
    const local: Area;
  }
}
