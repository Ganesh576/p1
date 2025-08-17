import React, { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, useNavigate, useParams } from 'react-router-dom'
import productsData from './data/products'

function useCart() {
  const [cart, setCart] = useState(() => {
    const raw = sessionStorage.getItem('cart')
    return raw ? JSON.parse(raw) : []
  })
  useEffect(() => { sessionStorage.setItem('cart', JSON.stringify(cart)) }, [cart])

  const add = (product, qty = 1) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id)
      if (existing) {
        return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + qty } : i)
      }
      return [...prev, { id: product.id, title: product.title, price: product.price, image: product.image, qty }]
    })
  }
  const remove = (id) => setCart(prev => prev.filter(i => i.id !== id))
  const update = (id, qty) => setCart(prev => prev.map(i => i.id === id ? { ...i, qty: Math.max(1, qty) } : i))
  const clear = () => setCart([])
  const totals = useMemo(() => {
    const items = cart.reduce((a, c) => a + c.qty, 0)
    const subtotal = cart.reduce((a, c) => a + c.price * c.qty, 0)
    const shipping = subtotal > 0 ? 4.99 : 0
    const tax = subtotal * 0.07
    const total = subtotal + shipping + tax
    return { items, subtotal, shipping, tax, total }
  }, [cart])
  return { cart, add, remove, update, clear, totals }
}

function Navbar({ cartCount, onSearch, query, onToggleTheme, theme, onDemoLogin, user }) {
  const navigate = useNavigate()
  return (
    <div className="navbar">
      <div className="brand link" onClick={() => navigate('/') }>
        <span className="logo">🛍️</span>
        ShopSail
      </div>
      <div className="search">
        <span>🔎</span>
        <input value={query} onChange={(e) => onSearch(e.target.value)} placeholder="Search for products, brands and more" />
      </div>
      <div className="nav-actions">
        {user ? (
          <span className="link">Hi, {user.name}</span>
        ) : (
          <button className="btn" onClick={onDemoLogin}>Enter as Demo User</button>
        )}
        <button className="btn ghost" onClick={onToggleTheme}>{theme === 'dark' ? '🌙' : '☀️'}</button>
        <Link to="/cart" className="link" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          🛒 <span className="badge">{cartCount}</span>
        </Link>
      </div>
    </div>
  )
}

function Catalog({ products, onAdd, filters, setFilters }) {
  return (
    <div className="main container">
      <aside className="sidebar">
        <h3>Filters</h3>
        <div className="section">
          <label>Category</label>
          <select className="btn block" value={filters.category} onChange={(e) => setFilters(f => ({ ...f, category: e.target.value }))}>
            <option value="">All</option>
            <option>Electronics</option>
            <option>Home</option>
            <option>Fashion</option>
            <option>Sports</option>
            <option>Books</option>
          </select>
        </div>
        <div className="section">
          <label>Price range</label>
          <div className="row">
            <input type="number" placeholder="Min" value={filters.min} onChange={(e) => setFilters(f => ({ ...f, min: e.target.value }))} />
            <input type="number" placeholder="Max" value={filters.max} onChange={(e) => setFilters(f => ({ ...f, max: e.target.value }))} />
          </div>
        </div>
        <div className="section">
          <label>Rating</label>
          <select className="btn block" value={filters.rating} onChange={(e) => setFilters(f => ({ ...f, rating: e.target.value }))}>
            <option value="">Any</option>
            <option value="4">4★ & up</option>
            <option value="3">3★ & up</option>
            <option value="2">2★ & up</option>
          </select>
        </div>
        <button className="btn block" onClick={() => setFilters({ category: '', min: '', max: '', rating: '' })}>Reset</button>
      </aside>
      <section>
        <div className="grid">
          {products.map(p => (
            <ProductCard key={p.id} product={p} onAdd={() => onAdd(p)} />
          ))}
        </div>
      </section>
    </div>
  )
}

function ProductCard({ product, onAdd }) {
  return (
    <div className="card">
      <Link to={`/product/${product.id}`}>
        <img src={product.image} alt={product.title} loading="lazy" />
      </Link>
      <div className="content">
        <p className="title">{product.title}</p>
        <div className="meta">
          <span>⭐ {product.rating}</span>
          <span>•</span>
          <span className="price">${product.price.toFixed(2)}</span>
        </div>
      </div>
      <div className="actions">
        <Link to={`/product/${product.id}`} className="btn">View</Link>
        <button className="btn primary" onClick={onAdd}>Add to Cart</button>
      </div>
    </div>
  )
}

function ProductPage({ addToCart }) {
  const { id } = useParams()
  const [showReview, setShowReview] = useState(false)
  const product = productsData.find(p => String(p.id) === id)
  if (!product) return <div className="container" style={{ padding: 24 }}>Product not found.</div>
  return (
    <div className="container" style={{ padding: 18 }}>
      <div className="product-page">
        <div className="product-body">
          <img src={product.image} alt={product.title} />
          <div>
            <h2 style={{ marginTop: 0 }}>{product.title}</h2>
            <p className="product-meta">{product.category} • ⭐ {product.rating} • {product.reviews} reviews</p>
            <div className="separator" />
            <p>{product.description}</p>
            <div className="separator" />
            <h3 style={{ margin: '8px 0' }}>${product.price.toFixed(2)}</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" onClick={() => addToCart(product)}>Add to Cart</button>
              <button className="btn" onClick={() => setShowReview(true)}>Write a Review</button>
            </div>
          </div>
        </div>
      </div>
      {showReview && <ReviewModal onClose={() => setShowReview(false)} />}
    </div>
  )
}

function ReviewModal({ onClose }) {
  const [text, setText] = useState('')
  const [rating, setRating] = useState(5)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Write a Review</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span>Rating:</span>
          <select className="btn" value={rating} onChange={(e) => setRating(Number(e.target.value))}>
            {[5,4,3,2,1].map(r => <option key={r} value={r}>{r}★</option>)}
          </select>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Share your thoughts (demo only)" />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={onClose}>Submit</button>
        </div>
      </div>
    </div>
  )
}

function CartPage({ cart, update, remove, totals }) {
  const navigate = useNavigate()
  return (
    <div className="container" style={{ padding: 18 }}>
      <h2>Shopping Cart</h2>
      <div className="cart">
        {cart.length === 0 && <p>Your cart is empty.</p>}
        {cart.map(item => (
          <div key={item.id} className="cart-item">
            <img src={item.image} alt={item.title} style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8 }} />
            <div>
              <div style={{ fontWeight: 700 }}>{item.title}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>Price: ${item.price.toFixed(2)}</div>
              <div className="qty" style={{ marginTop: 8 }}>
                <button className="btn" onClick={() => update(item.id, item.qty - 1)}>-</button>
                <span>{item.qty}</span>
                <button className="btn" onClick={() => update(item.id, item.qty + 1)}>+</button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
              <div style={{ fontWeight: 800 }}>${(item.price * item.qty).toFixed(2)}</div>
              <button className="btn" onClick={() => remove(item.id)}>Remove</button>
            </div>
          </div>
        ))}
        {cart.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div className="separator" />
            <div style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
              <div>Subtotal: <strong>${totals.subtotal.toFixed(2)}</strong></div>
              <div>Shipping: <strong>${totals.shipping.toFixed(2)}</strong></div>
              <div>Tax: <strong>${totals.tax.toFixed(2)}</strong></div>
              <div>Total: <strong>${totals.total.toFixed(2)}</strong></div>
            </div>
            <button className="btn primary" onClick={() => navigate('/checkout')}>Proceed to Checkout</button>
          </div>
        )}
      </div>
    </div>
  )
}

function CheckoutPage() {
  return (
    <div className="container" style={{ padding: 18 }}>
      <h2>Checkout (Demo)</h2>
      <div className="cart">
        <p>This is a demo. Checkout flow is non-functional. You can return to the catalog to keep browsing.</p>
        <Link to="/" className="btn">Back to Catalog</Link>
      </div>
    </div>
  )
}

export default function App() {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ category: '', min: '', max: '', rating: '' })
  const [user, setUser] = useState(() => {
    const raw = sessionStorage.getItem('demoUser')
    return raw ? JSON.parse(raw) : null
  })
  const { cart, add, remove, update, clear, totals } = useCart()

  const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  const toggleTheme = () => {
    const isDark = document.documentElement.classList.toggle('dark')
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }

  const products = useMemo(() => {
    return productsData.filter(p => {
      const matchesQuery = p.title.toLowerCase().includes(query.toLowerCase()) || p.description.toLowerCase().includes(query.toLowerCase())
      const matchesCategory = !filters.category || p.category === filters.category
      const minOk = !filters.min || p.price >= Number(filters.min)
      const maxOk = !filters.max || p.price <= Number(filters.max)
      const ratingOk = !filters.rating || p.rating >= Number(filters.rating)
      return matchesQuery && matchesCategory && minOk && maxOk && ratingOk
    })
  }, [query, filters])

  const demoLogin = () => {
    const demo = { id: 'demo', name: 'Demo User' }
    setUser(demo)
    sessionStorage.setItem('demoUser', JSON.stringify(demo))
  }

  return (
    <BrowserRouter>
      <Navbar cartCount={cart.reduce((a,c)=>a+c.qty,0)} onSearch={setQuery} query={query} onToggleTheme={toggleTheme} theme={theme} onDemoLogin={demoLogin} user={user} />
      <Routes>
        <Route path="/" element={<Catalog products={products} onAdd={add} filters={filters} setFilters={setFilters} />} />
        <Route path="/product/:id" element={<ProductPage addToCart={add} />} />
        <Route path="/cart" element={<CartPage cart={cart} update={update} remove={remove} totals={totals} clear={clear} />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="*" element={<div className="container" style={{ padding: 24 }}>Not found</div>} />
      </Routes>
    </BrowserRouter>
  )
}