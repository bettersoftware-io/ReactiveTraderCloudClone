interface TileHeaderProps {
  base: string;
  terms: string;
}

export function TileHeader({ base, terms }: TileHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 2,
        fontSize: 13,
        fontWeight: 600,
        color: "var(--text-primary)",
      }}
    >
      <span>{base}</span>
      <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>/</span>
      <span>{terms}</span>
    </div>
  );
}
