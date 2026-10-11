import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle({ theme, onToggle, className = '' }) {
  const next = theme === 'light' ? 'dark' : 'light';
  return (
    <button type="button" className={`theme-toggle inline-flex items-center gap-2 ${className}`}
      onClick={onToggle} aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}>
      {next === 'dark' ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}
      <span>{next === 'dark' ? 'Dark mode' : 'Light mode'}</span>
    </button>
  );
}
