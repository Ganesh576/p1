import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Auth store
export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      
      login: (userData, tokens) => {
        set({
          user: userData,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          isAuthenticated: true,
        })
      },
      
      logout: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        })
      },
      
      updateUser: (userData) => {
        set({ user: { ...get().user, ...userData } })
      },
      
      updateTokens: (tokens) => {
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        })
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

// Cart store
export const useCartStore = create((set, get) => ({
  items: [],
  total: 0,
  itemCount: 0,
  isOpen: false,
  
  addItem: (product, quantity = 1) => {
    const items = get().items
    const existingItem = items.find(item => item.id === product.id)
    
    if (existingItem) {
      set({
        items: items.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        ),
      })
    } else {
      set({
        items: [...items, { ...product, quantity }],
      })
    }
    
    get().calculateTotals()
  },
  
  removeItem: (productId) => {
    set({
      items: get().items.filter(item => item.id !== productId),
    })
    get().calculateTotals()
  },
  
  updateQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(productId)
      return
    }
    
    set({
      items: get().items.map(item =>
        item.id === productId ? { ...item, quantity } : item
      ),
    })
    get().calculateTotals()
  },
  
  clearCart: () => {
    set({
      items: [],
      total: 0,
      itemCount: 0,
    })
  },
  
  calculateTotals: () => {
    const items = get().items
    const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)
    
    set({ total, itemCount })
  },
  
  toggleCart: () => {
    set({ isOpen: !get().isOpen })
  },
  
  openCart: () => set({ isOpen: true }),
  closeCart: () => set({ isOpen: false }),
}))

// UI store
export const useUIStore = create((set) => ({
  sidebarOpen: false,
  searchQuery: '',
  selectedCategory: null,
  sortBy: 'created_at',
  sortOrder: 'DESC',
  
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  setSortBy: (sortBy) => set({ sortBy }),
  setSortOrder: (sortOrder) => set({ sortOrder }),
  
  resetFilters: () => set({
    searchQuery: '',
    selectedCategory: null,
    sortBy: 'created_at',
    sortOrder: 'DESC',
  }),
}))

// Product store
export const useProductStore = create((set, get) => ({
  products: [],
  featuredProducts: [],
  categories: [],
  currentProduct: null,
  loading: false,
  error: null,
  
  setProducts: (products) => set({ products }),
  setFeaturedProducts: (products) => set({ featuredProducts: products }),
  setCategories: (categories) => set({ categories }),
  setCurrentProduct: (product) => set({ currentProduct: product }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  
  addProduct: (product) => {
    set({
      products: [...get().products, product],
    })
  },
  
  updateProduct: (productId, updates) => {
    set({
      products: get().products.map(product =>
        product.id === productId ? { ...product, ...updates } : product
      ),
    })
  },
  
  clearError: () => set({ error: null }),
}))

// Order store
export const useOrderStore = create((set, get) => ({
  orders: [],
  currentOrder: null,
  loading: false,
  error: null,
  
  setOrders: (orders) => set({ orders }),
  setCurrentOrder: (order) => set({ currentOrder: order }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  
  addOrder: (order) => {
    set({
      orders: [order, ...get().orders],
    })
  },
  
  updateOrder: (orderId, updates) => {
    set({
      orders: get().orders.map(order =>
        order.id === orderId ? { ...order, ...updates } : order
      ),
    })
  },
  
  clearError: () => set({ error: null }),
}))