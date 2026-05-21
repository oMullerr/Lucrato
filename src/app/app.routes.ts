import { Routes } from '@angular/router';
import { authGuard, guestGuard, verifyEmailGuard } from './core/guards/auth.guard';
import { unsavedChangesGuard } from './core/guards/unsaved-changes.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'inventory', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent),
    canActivate: [guestGuard],
    title: 'Login · Lucrato',
  },
  {
    path: 'verify-email',
    loadComponent: () => import('./features/auth/verify-email.component').then(m => m.VerifyEmailComponent),
    canActivate: [verifyEmailGuard],
    title: 'Verificar e-mail · Lucrato',
  },
  {
    path: 'inventory',
    loadComponent: () => import('./features/inventory/inventory.component').then(m => m.InventoryComponent),
    canActivate: [authGuard],
    title: 'Estoque · Lucrato',
  },
  {
    path: 'purchases',
    loadComponent: () => import('./features/purchases/purchases.component').then(m => m.PurchasesComponent),
    canActivate: [authGuard],
    title: 'Compras · Lucrato',
  },
  {
    path: 'sales',
    loadComponent: () => import('./features/sales/sales.component').then(m => m.SalesComponent),
    canActivate: [authGuard],
    title: 'Vendas · Lucrato',
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [authGuard],
    title: 'Dashboard · Lucrato',
  },
  {
    path: 'analytics',
    loadComponent: () => import('./features/analytics/analytics.component').then(m => m.AnalyticsComponent),
    canActivate: [authGuard],
    title: 'Análises · Lucrato',
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent),
    canActivate: [authGuard],
    canDeactivate: [unsavedChangesGuard],
    title: 'Configurações · Lucrato',
  },
  {
    path: 'profile',
    loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent),
    canActivate: [authGuard],
    title: 'Perfil · Lucrato',
  },
  {
    path: 'instructions',
    loadComponent: () => import('./features/instructions/instructions.component').then(m => m.InstructionsComponent),
    canActivate: [authGuard],
    title: 'Instruções · Lucrato',
  },
  { path: '**', redirectTo: 'inventory' },
];
