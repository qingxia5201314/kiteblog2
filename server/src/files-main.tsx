import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AdminAccessGate } from './components/auth/AdminAccessGate';
import { FilesPage } from './pages/FilesPage';
import { MediaPreviewPage } from './pages/MediaPreviewPage';
import './styles/index.css';
import './files-standalone.css';

function FilesApp() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AdminAccessGate>
          <Routes>
            <Route path="/files/preview" element={<MediaPreviewPage />} />
            <Route path="*" element={<FilesPage />} />
          </Routes>
        </AdminAccessGate>
      </AppProvider>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FilesApp />
  </React.StrictMode>
);
