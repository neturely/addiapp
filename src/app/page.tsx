'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { AddiApp } from '@/types/addiapp'

export default function HomePage() {
  const [addiapps, setAddiapps] = useState<AddiApp[]>([])
  const [title, setTitle] = useState('')

  useEffect(() => {
    fetchAddiapps()
  }, [])

  const fetchAddiapps = async () => {
    const { data } = await supabase
      .from('addiapp')
      .select('*')
      .order('inserted_at', { ascending: false })

    setAddiapps(data || [])
  }

  const addAddiapp = async () => {
    if (!title.trim()) return
    await supabase.from('addiapp').insert({ title })
    setTitle('')
    fetchAddiapps()
  }

  const toggleAddiapp = async (id: string, completed: boolean) => {
    await supabase.from('addiapp').update({ completed: !completed }).eq('id', id)
    fetchAddiapps()
  }

  return (
    <main className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">📝 My AddiApp List</h1>

      <div className="flex mb-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 p-2 border rounded-l"
          placeholder="Add a new task..."
        />
        <button onClick={addAddiapp} className="bg-blue-600 text-white px-4 rounded-r">Add</button>
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
