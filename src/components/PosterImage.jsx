import { useState } from 'react';
export default function PosterImage({ src, alt, className = '', loading }) {
  const [settled, setSettled] = useState(null);
  const [failed, setFailed] = useState(null);
  const pending = settled !== src;
  return (
    <span className={`poster-image ${className}`} aria-busy={pending}>
      {pending && (
        <span className="shimmer poster-shimmer" aria-hidden="true" />
      )}
      <img
        src={src}
        alt={alt}
        loading={loading}
        className={pending || failed === src ? 'poster-hidden' : ''}
        onLoad={() => {
          setSettled(src);
          setFailed(null);
        }}
        onError={() => {
          setSettled(src);
          setFailed(src);
        }}
      />
      {failed === src && (
        <span className="poster-image-fallback" role="img" aria-label={alt}>
          {alt}
        </span>
      )}
    </span>
  );
}
