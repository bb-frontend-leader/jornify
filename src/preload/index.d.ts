import type { ApiJornify } from './tipos'

declare global {
  interface Window {
    jornify: ApiJornify
  }
}

export {}
