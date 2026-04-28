export function PageSkeleton() {
  return (
    <div className="p-6 animate-pulse space-y-4">
      <div className="h-6 bg-surface-card rounded w-48" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-surface-card rounded-lg" />
        ))}
      </div>
      <div className="h-48 bg-surface-card rounded-lg" />
    </div>
  );
}
