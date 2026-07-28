"use client";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function AdminSearchBar({
  value,
  onChange,
  placeholder = "Search...",
  className = "",
}: Props) {
  return (
    <input
      type="search"
      className={`search-input ${className}`}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
