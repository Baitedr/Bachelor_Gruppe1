import { useState, useEffect } from 'react'
import './App.css'
import api from './services/api'
import ItemList from './components/ItemList'
import ItemForm from './components/ItemForm'

function App() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [apiStatus, setApiStatus] = useState(null)

  useEffect(() => {
    checkApiHealth()
    fetchItems()
  }, [])

  const checkApiHealth = async () => {
    try {
      const data = await api.checkHealth()
      setApiStatus(data.status)
    } catch (err) {
      setApiStatus('error')
      console.error('API health check failed:', err)
    }
  }

  const fetchItems = async () => {
    try {
      setLoading(true)
      const data = await api.getItems()
      setItems(data)
      setError(null)
    } catch (err) {
      setError('Failed to fetch items')
      console.error('Error fetching items:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateItem = async (itemData) => {
    try {
      const newItem = await api.createItem(itemData)
      setItems([...items, newItem])
      setError(null)
    } catch (err) {
      setError('Failed to create item')
      console.error('Error creating item:', err)
    }
  }

  const handleDeleteItem = async (id) => {
    try {
      await api.deleteItem(id)
      setItems(items.filter(item => item.id !== id))
      setError(null)
    } catch (err) {
      setError('Failed to delete item')
      console.error('Error deleting item:', err)
    }
  }

  return (
    <div className="App">
      <header>
        <h1>React + Ruby on Rails</h1>
        <div className={`api-status ${apiStatus === 'ok' ? 'connected' : 'disconnected'}`}>
          API Status: {apiStatus === 'ok' ? '🟢 Connected' : '🔴 Disconnected'}
        </div>
      </header>

      <main>
        {error && <div className="error">{error}</div>}
        
        <section className="form-section">
          <h2>Add New Item</h2>
          <ItemForm onSubmit={handleCreateItem} />
        </section>

        <section className="list-section">
          <h2>Items</h2>
          {loading ? (
            <p>Loading...</p>
          ) : (
            <ItemList items={items} onDelete={handleDeleteItem} />
          )}
        </section>
      </main>
    </div>
  )
}

export default App
