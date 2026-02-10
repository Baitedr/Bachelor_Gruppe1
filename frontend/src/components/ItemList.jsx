import React from 'react'

function ItemList({ items, onDelete }) {
  if (!items || items.length === 0) {
    return <div className="empty-state">No items yet. Create one above!</div>
  }

  return (
    <div className="item-list">
      {items.map((item) => (
        <div key={item.id} className="item-card">
          <div className="item-content">
            <h3>{item.name}</h3>
            {item.description && <p>{item.description}</p>}
          </div>
          <button 
            className="delete-btn"
            onClick={() => onDelete(item.id)}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  )
}

export default ItemList
