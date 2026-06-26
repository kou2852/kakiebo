import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 40, maxWidth: 560, margin: '80px auto',
          background: 'var(--bg2, #171717)', border: '1px solid var(--bd, #333)',
          borderRadius: 9, color: 'var(--tx, #e8e4dc)', fontFamily: 'sans-serif',
        }}>
          <h2 style={{ color: 'var(--red, #e07070)', fontSize: 18, marginBottom: 12 }}>
            エラーが発生しました
          </h2>
          <pre style={{
            fontSize: 12, color: 'var(--tx3, #8a8480)', whiteSpace: 'pre-wrap',
            background: 'var(--bg0, #0a0a0a)', padding: 12, borderRadius: 6,
            maxHeight: 200, overflow: 'auto',
          }}>
            {this.state.error.message}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{
              marginTop: 16, padding: '8px 16px', background: 'var(--ac, #0d9488)',
              color: 'var(--ac-tx, #fff)', border: 'none', borderRadius: 8, cursor: 'pointer',
              fontWeight: 600, fontSize: 13,
            }}
          >
            リロード
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
