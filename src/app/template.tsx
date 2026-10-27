/** Every navigation re-mounts this wrapper, so each page fades and rises in (CSS, off the main thread). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
