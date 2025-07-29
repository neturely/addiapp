import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { SupabaseAdapter } from '@auth/supabase-adapter'
import { supabaseServer } from '@/lib/supabaseServer'

const handler = NextAuth({
  adapter: SupabaseAdapter({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    secret: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  }),
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials) return null
        const { data, error } = await supabaseServer.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        })
        if (error || !data.user) return null
        return { id: data.user.id, email: data.user.email }
      },
    }),
  ],
  pages: {
    signIn: '/signin',
  },
  secret: process.env.NEXTAUTH_SECRET,
})

export { handler as GET, handler as POST }
