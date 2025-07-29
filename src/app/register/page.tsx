'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError(error.message)
      return
    }
    await signIn('credentials', { email, password, callbackUrl: '/' })
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-6 rounded shadow w-full max-w-sm">
        <h1 className="text-xl font-bold mb-4 text-center">Register</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            className="w-full p-2 border rounded"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
          />
          <input
            className="w-full p-2 border rounded"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
          />
          {error && <p className="text-red-600">{error}</p>}
          <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded">
            Register
          </button>
        </form>
        <p className="text-center text-sm mt-4">
          Already have an account? <Link href="/signin" className="text-blue-600">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
