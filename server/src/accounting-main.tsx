import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppProvider } from './context/AppContext';
import { AdminAccessGate } from './components/auth/AdminAccessGate';
import { AccountingPage } from './pages/AccountingPage';
import './styles/index.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><AppProvider><AdminAccessGate><AccountingPage /></AdminAccessGate></AppProvider></React.StrictMode>);
