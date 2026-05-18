import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'estoque', pathMatch: 'full' },
  {
    path: 'estoque',
    loadComponent: () => import('./features/estoque/estoque.component').then(m => m.EstoqueComponent),
    title: 'Estoque · Lucrato',
  },
  {
    path: 'compras',
    loadComponent: () => import('./features/compras/compras.component').then(m => m.ComprasComponent),
    title: 'Compras · Lucrato',
  },
  {
    path: 'vendas',
    loadComponent: () => import('./features/vendas/vendas.component').then(m => m.VendasComponent),
    title: 'Vendas · Lucrato',
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
    title: 'Dashboard · Lucrato',
  },
  {
    path: 'analises',
    loadComponent: () => import('./features/analises/analises.component').then(m => m.AnalisesComponent),
    title: 'Análises · Lucrato',
  },
  {
    path: 'configuracoes',
    loadComponent: () => import('./features/configuracoes/configuracoes.component').then(m => m.ConfiguracoesComponent),
    title: 'Configurações · Lucrato',
  },
  {
    path: 'instrucoes',
    loadComponent: () => import('./features/instrucoes/instrucoes.component').then(m => m.InstrucoesComponent),
    title: 'Instruções · Lucrato',
  },
  { path: '**', redirectTo: 'estoque' },
];
