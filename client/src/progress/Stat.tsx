export function Stat({
  label,
  value,
  emphasized = false,
  className,
}: {
  label: string;
  value: string | number;
  emphasized?: boolean;
  className?: string;
}) {
  const classes = ['stat-tile', emphasized && 'emphasized', className].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
