import { lazy } from 'react';

export const LazyAccountingPage = lazy(() => import('./AccountingPage').then((module) => ({ default: module.AccountingPage })));
export const LazyFilesPage = lazy(() => import('./FilesPage').then((module) => ({ default: module.FilesPage })));
export const LazyImagesPage = lazy(() => import('./ImagesPage').then((module) => ({ default: module.ImagesPage })));
export const LazyAdminPage = lazy(() => import('./AdminPage').then((module) => ({ default: module.AdminPage })));
export const LazyMediaPreviewPage = lazy(() => import('./MediaPreviewPage').then((module) => ({ default: module.MediaPreviewPage })));
export const LazyArticlePreviewPage = lazy(() => import('./ArticlePreviewPage').then((module) => ({ default: module.ArticlePreviewPage })));
export const LazyAboutPage = lazy(() => import('./AboutPage').then((module) => ({ default: module.AboutPage })));
