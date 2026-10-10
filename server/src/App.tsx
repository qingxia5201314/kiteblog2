import { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { BlogDataProvider } from './context/BlogDataContext';
import { Layout } from './components/Layout';
import { AdminAccessGate } from './components/auth/AdminAccessGate';
import { HomePage } from './pages/HomePage';
import { LazyAboutPage, LazyAccountingPage, LazyAdminPage, LazyArticlePreviewPage, LazyFilesPage, LazyImagesPage, LazyMediaPreviewPage } from './pages/lazy';

function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <BlogDataProvider>
          <Suspense
            fallback={
              <div className="page-loading" aria-label="页面加载中" role="status">
                <span />
                <span />
                <span />
              </div>
            }
          >
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/posts/:slug" element={<HomePage />} />
                <Route path="/accounting" element={<AdminAccessGate><LazyAccountingPage /></AdminAccessGate>} />
                <Route path="/about" element={<LazyAboutPage />} />
                <Route path="/files" element={<AdminAccessGate><LazyFilesPage /></AdminAccessGate>} />
                <Route path="/files/preview" element={<AdminAccessGate><LazyMediaPreviewPage /></AdminAccessGate>} />
                <Route path="/images" element={<AdminAccessGate><LazyImagesPage /></AdminAccessGate>} />
                <Route path="/admin" element={<AdminAccessGate><LazyAdminPage /></AdminAccessGate>} />
                <Route path="/admin/preview/:id" element={<AdminAccessGate><LazyArticlePreviewPage /></AdminAccessGate>} />
              </Route>
            </Routes>
          </Suspense>
        </BlogDataProvider>
      </AppProvider>
    </BrowserRouter>
  );
}

export default App;
