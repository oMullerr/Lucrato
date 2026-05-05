import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'estoque', pathMatch: 'full' },
  {
    path: 'estoque',
    loadComponent: () => import('./features/estoque/estoque.component').then(m => m.EstoqueComponent),
    title: 'Estoque · ML Gestão',
  },
  {
    path: 'compras',
    loadComponent: () => import('./features/compras/compras.component').then(m => m.ComprasComponent),
    title: 'Compras · ML Gestão',
  },
  {
    path: 'vendas',
    loadComponent: () => import('./features/vendas/vendas.component').then(m => m.VendasComponent),
    title: 'Vendas · ML Gestão',
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
    title: 'Dashboard · ML Gestão',
  },
  {
    path: 'analises',
    loadComponent: () => import('./features/analises/analises.component').then(m => m.AnalisesComponent),
    title: 'Análises · ML Gestão',
  },
  {
    path: 'configuracoes',
    loadComponent: () => import('./features/configuracoes/configuracoes.component').then(m => m.ConfiguracoesComponent),
    title: 'Configurações · ML Gestão',
  },
  {
    path: 'instrucoes',
    loadComponent: () => import('./features/instrucoes/instrucoes.component').then(m => m.InstrucoesComponent),
    title: 'Instruções · ML Gestão',
  },
  { path: '**', redirectTo: 'estoque' },
];
