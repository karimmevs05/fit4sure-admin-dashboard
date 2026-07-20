export default function TestPage() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'Arial' }}>
      <h1>✅ React App is Working!</h1>
      <p>If you can see this, the React app rendered successfully.</p>
      <p>Backend API Base URL: http://localhost:3000</p>
      <button
        onClick={() => {
          fetch('http://localhost:3000/health')
            .then(r => r.json())
            .then(d => alert('Backend OK: ' + JSON.stringify(d)))
            .catch(e => alert('Backend error: ' + e.message))
        }}
        style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
      >
        Test Backend Connection
      </button>
    </div>
  )
}
