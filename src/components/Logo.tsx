import { LOGO_PATH } from '../constants';

type LogoProps = {
  size?: number;
  className?: string;
};

export default function Logo({ size = 28, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Monogramm"
    >
      <path d={LOGO_PATH} fill="#ffffff" />
    </svg>
  );
}
