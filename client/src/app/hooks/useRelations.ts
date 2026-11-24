import { useEffect, useState } from 'react';

type RelationsLike = {
  on(event: string, listener: () => void): void;
  removeListener(event: string, listener: () => void): void;
};

const RelationsEvent = {
  Add: 'add',
  Redaction: 'redaction',
  Remove: 'remove',
} as const;

export const useRelations = <T>(
  relations: RelationsLike,
  getRelations: (relations: RelationsLike) => T
) => {
  const [data, setData] = useState(() => getRelations(relations));

  useEffect(() => {
    const handleUpdate = () => {
      setData(getRelations(relations));
    };
    relations.on(RelationsEvent.Add, handleUpdate);
    relations.on(RelationsEvent.Redaction, handleUpdate);
    relations.on(RelationsEvent.Remove, handleUpdate);
    return () => {
      relations.removeListener(RelationsEvent.Add, handleUpdate);
      relations.removeListener(RelationsEvent.Redaction, handleUpdate);
      relations.removeListener(RelationsEvent.Remove, handleUpdate);
    };
  }, [relations, getRelations]);

  return data;
};
