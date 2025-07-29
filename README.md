# AddiApp

Web deployment file repository for addiapp.com - In progress task tracker built with [Next.js](https://nextjs.org) and Supabase.

## Features

- User authentication with Supabase
- Task creation, completion, and management
- Responsive UI with Tailwind CSS

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer recommended)
- [npm](https://www.npmjs.com/) (v9 or newer recommended)
- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase account](https://supabase.com/)
- [Vercel Platform Recommended](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme)

## Setup

Clone the repository using the command below:

```console
you@console:~$ git clone git@github.com:neturely/addiapp.git
```

Run `./scripts/setup.sh` to install dependencies before running other npm commands.

Next create a `.env.local` file with the following variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=<your Supabase url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your Supabase anon key>
```

Once configured, start the development server:

```bash
npm run dev
```

## Contributing

Pull requests and issues are welcome. If you spot a problem or have a suggestion, feel free to open a discussion.

## License

This project is licensed under the MIT License.
