'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AddiApp } from '@/types/addiapp'

export default function HomePage() {
  const { data: session, status } = useSession()
  const [addiapps, setAddiapps] = useState<AddiApp[]>([])
  const [title, setTitle] = useState('')

  // Redirect to login if unauthenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      signIn() // shows the Auth.js sign-in modal/page
    }
  }, [status])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchAddiapps()
    }
  }, [status])

  const fetchAddiapps = async () => {
    const { data } = await supabase
      .from('addiapps')
      .select('*')
      .order('inserted_at', { ascending: false })
    setAddiapps(data || [])
  }

  const addAddiapp = async () => {
    if (!title.trim()) return
    await supabase.from('addiapps').insert({ title })
    setTitle('')
    fetchAddiapps()
  }

  const toggleAddiapp = async (id: string, completed: boolean) => {
    await supabase.from('addiapps').update({ completed: !completed }).eq('id', id)
    fetchAddiapps()
  }

  if (status === 'loading') return <p className="p-4">Loading session...</p>

  return (
    <main className="max-w-md mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">📝 My AddiApp</h1>
        <button onClick={() => signOut()} className="text-sm text-blue-600 hover:underline">
          Logout
        </button>
      </div>

      <div className="flex mb-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 p-2 border rounded-l"
          placeholder="Add a new task..."
        />
        <button onClick={addAddiapp} className="bg-blue-600 text-white px-4 rounded-r">
          Add
        </button>
      </div>

      <ul>
        {addiapps.map(app => (
          <li
            key={app.id}
            onClick={() => toggleAddiapp(app.id, app.completed)}
            className={`p-2 border-b cursor-pointer ${app.completed ? 'line-through text-gray-400' : ''}`}
          >
            {app.title}
          </li>
        ))}
      </ul>
    </main>
  )
}
