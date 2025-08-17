import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Prevent theme flash
const savedTheme = localStorage.getItem('theme') || 'light'
if (savedTheme === 'dark') {
  document.documentElement.classList.add('dark')
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)