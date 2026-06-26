import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

// 保存済みテーマを復元（既定はライト）
document.body.dataset.theme = localStorage.getItem('kk_theme') || 'light';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
