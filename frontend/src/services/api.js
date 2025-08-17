import axios from 'axios'
import toast from 'react-hot-toast'

// Create axios instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 10000,
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth-storage')
    if (token) {
      try {
        const authData = JSON.parse(token)
        if (authData.state?.accessToken) {
          config.headers.Authorization = `Bearer ${authData.state.accessToken}`
          // For orders service that expects user ID in header
          if (authData.state?.user?.id) {
            config.headers['x-user-id'] = authData.state.user.id
          }
        }
      } catch (error) {
        console.error('Error parsing auth token:', error)
      }
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error || error.message || 'An error occurred'
    
    if (error.response?.status === 401) {
      // Handle unauthorized - logout user
      localStorage.removeItem('auth-storage')
      window.location.href = '/login'
      toast.error('Session expired. Please login again.')
    } else if (error.response?.status >= 500) {
      toast.error('Server error. Please try again later.')
    } else if (error.response?.status >= 400) {
      toast.error(message)
    }
    
    return Promise.reject(error)
  }
)

// Auth API
export const authAPI = {
  login: async (credentials) => {
    const response = await api.post('/api/auth/login', credentials)
    return response.data
  },
  
  register: async (userData) => {
    const response = await api.post('/api/auth/register', userData)
    return response.data
  },
  
  logout: async () => {
    const response = await api.post('/api/auth/logout')
    return response.data
  },
  
  refreshToken: async (refreshToken) => {
    const response = await api.post('/api/auth/refresh', { refreshToken })
    return response.data
  },
  
  getProfile: async () => {
    const response = await api.get('/api/users/profile')
    return response.data
  },
  
  updateProfile: async (userData) => {
    const response = await api.put('/api/users/profile', userData)
    return response.data
  },
}

// Catalog API
export const catalogAPI = {
  getProducts: async (params = {}) => {
    const response = await api.get('/api/catalog/products', { params })
    return response.data
  },
  
  getProduct: async (id) => {
    const response = await api.get(`/api/catalog/products/${id}`)
    return response.data
  },
  
  getFeaturedProducts: async () => {
    const response = await api.get('/api/catalog/featured')
    return response.data
  },
  
  getCategories: async () => {
    const response = await api.get('/api/catalog/categories')
    return response.data
  },
  
  searchProducts: async (query, limit = 10) => {
    const response = await api.get('/api/catalog/search', {
      params: { q: query, limit }
    })
    return response.data
  },
}

// Cart API
export const cartAPI = {
  getCart: async () => {
    const response = await api.get('/api/cart')
    return response.data
  },
  
  addToCart: async (productId, quantity = 1) => {
    const response = await api.post('/api/cart/items', {
      product_id: productId,
      quantity
    })
    return response.data
  },
  
  updateCartItem: async (productId, quantity) => {
    const response = await api.put(`/api/cart/items/${productId}`, { quantity })
    return response.data
  },
  
  removeFromCart: async (productId) => {
    const response = await api.delete(`/api/cart/items/${productId}`)
    return response.data
  },
  
  clearCart: async () => {
    const response = await api.delete('/api/cart')
    return response.data
  },
}

// Orders API
export const ordersAPI = {
  getOrders: async (params = {}) => {
    const response = await api.get('/api/orders', { params })
    return response.data
  },
  
  getOrder: async (orderNumber) => {
    const response = await api.get(`/api/orders/${orderNumber}`)
    return response.data
  },
  
  checkout: async (orderData) => {
    const response = await api.post('/api/orders/checkout', orderData)
    return response.data
  },
  
  cancelOrder: async (orderNumber) => {
    const response = await api.patch(`/api/orders/${orderNumber}/cancel`)
    return response.data
  },
}

// Payments API
export const paymentsAPI = {
  getPaymentStatus: async (paymentId) => {
    const response = await api.get(`/api/payments/${paymentId}`)
    return response.data
  },
  
  getPaymentHistory: async (userId, params = {}) => {
    const response = await api.get(`/api/payments/user/${userId}`, { params })
    return response.data
  },
  
  refundPayment: async (paymentId, refundData) => {
    const response = await api.post(`/api/payments/${paymentId}/refund`, refundData)
    return response.data
  },
}

// Address API
export const addressAPI = {
  getAddresses: async () => {
    const response = await api.get('/api/users/addresses')
    return response.data
  },
  
  addAddress: async (addressData) => {
    const response = await api.post('/api/users/addresses', addressData)
    return response.data
  },
}

export default api