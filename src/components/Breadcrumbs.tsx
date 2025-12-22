import { ChevronRight, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

interface BreadcrumbItem {
  label: string;
  path: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center text-sm text-gray-500 mb-4">
      <Link to="/" className="hover:text-gray-700 flex items-center gap-1">
        <Home className="w-4 h-4" />
        Mis Aulas
      </Link>
      {items.map((item, index) => (
        <div key={index} className="flex items-center">
          <ChevronRight className="w-4 h-4 mx-1" />
          {index === items.length - 1 ? (
            <span className="font-medium text-gray-700">{item.label}</span>
          ) : (
            <Link to={item.path} className="hover:text-gray-700">
              {item.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
