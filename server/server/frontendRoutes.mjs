export const frontendRoutePaths = [
  '/accounting',
  '/about',
  '/files',
  '/files/preview',
  '/images',
  '/admin',
  '/admin/preview/:id',
];

export function registerFrontendRoutes(app, serveSpaShell) {
  for (const path of frontendRoutePaths) app.get(path, serveSpaShell);
}
