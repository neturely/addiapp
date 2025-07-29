'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { AddiApp } from '@/types/addiapp'

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [addiapps, setAddiapps] = useState<AddiApp[]>([])
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!loading && user) {
      fetchAddiapps()
    } else if (!loading && !user) {
      window.location.href = '/signin'
    }
  }, [loading, user])

  const fetchAddiapps = async () => {
    try {
      setError(null)
      const { data, error } = await supabase
        .from('addiapp')
        .select('*')
        .order('inserted_at', { ascending: false })
      if (error) throw error
      setAddiapps(data || [])
    } catch (err) {
      console.error('Error fetching tasks:', err)
      setError('Failed to load tasks')
    }
  }

  const addAddiapp = async () => {
    if (!title.trim()) return
    try {
      const { error } = await supabase.from('addiapp').insert({ title })
      if (error) throw error
      setTitle('')
      fetchAddiapps()
    } catch (err) {
      console.error('Error adding task:', err)
      setError('Failed to add task')
    }
  }

  const toggleAddiapp = async (id: string, completed: boolean) => {
    try {
      const { error } = await supabase
        .from('addiapp')
        .update({ completed: !completed })
        .eq('id', id)
      if (error) throw error
      fetchAddiapps()
    } catch (err) {
      console.error('Error updating task:', err)
      setError('Failed to update task')
    }
  }

  if (loading) return <p className="p-4">Loading session...</p>

  return (
    <main className="max-w-md mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">📝 My AddiApp</h1>
        <button onClick={() => supabase.auth.signOut()} className="text-sm text-blue-600 hover:underline">
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

      {error && <p className="mb-4 text-red-600">{error}</p>}

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
