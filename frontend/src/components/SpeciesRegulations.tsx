import type { Species } from "../api/types";

interface SpeciesRegulationsProps {
  species: Species;
}

export default function SpeciesRegulations({ species }: SpeciesRegulationsProps) {
  const { min_size, bag_limit, regulation_notes } = species;
  if (!min_size && !bag_limit && !regulation_notes) return null;

  return (
    <div className="regs-box">
      <p className="section-label">CA Regulations (San Diego)</p>
      <div className="card-stats" style={{ marginBottom: regulation_notes ? 8 : 0 }}>
        {min_size && <span className="card-stat">Min size: {min_size}</span>}
        {bag_limit && <span className="card-stat">Bag limit: {bag_limit}</span>}
      </div>
      {regulation_notes && <p className="card-meta">{regulation_notes}</p>}
    </div>
  );
}
