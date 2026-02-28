'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(false);

    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push('/');
    } else {
      setError(true);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      fontFamily: 'var(--font-eb-garamond), "Times New Roman", serif',
      background: '#fff',
    }}>
      <form onSubmit={handleSubmit} style={{ textAlign: 'center' }}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder=""
          autoFocus
          style={{
            border: 'none',
            borderBottom: '1px solid #000',
            outline: 'none',
            fontSize: '18px',
            fontFamily: 'inherit',
            textAlign: 'center',
            padding: '4px 0',
            background: 'transparent',
            color: '#000',
            width: '200px',
          }}
        />
        {error && (
          <p style={{ color: 'red', fontSize: '14px', marginTop: '12px' }}>
            try again
          </p>
        )}
      </form>
    </div>
  );
}
