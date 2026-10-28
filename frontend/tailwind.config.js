/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0B1F33', // Dark navy
          800: '#12304A', // Primary deep navy
          700: '#1E4366',
          600: '#2A5885',
        },
        teal: {
          50: '#E6F5F4',  // Soft teal
          100: '#CEEAE8',
          500: '#087F8C', // Medical teal
          600: '#066B77',
          700: '#04535C',
        },
        clinical: {
          bg: '#F7FAFC',      // Clean background
          surface: '#FFFFFF', // Surface white
          text: '#172B3A',    // Primary text
          muted: '#627586',   // Secondary text
          border: '#E1E8EF',  // Border
          success: '#21865B', // Success
          warning: '#B7791F', // Warning
          error: '#B42318',   // Error
        },
        workspace: {
          bg: '#0A1420',
          card: '#0F2033',
          border: '#1A334F',
          highlight: '#0BB3C7',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      }
    },
  },
  plugins: [],
}
