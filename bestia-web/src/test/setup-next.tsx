/**
 * Sostituti minimi dei moduli di Next.js per i test dell'interfaccia (jsdom, senza server).
 * Si importano con `vi.mock` nei singoli file di test.
 */
import type { AnchorHTMLAttributes, ImgHTMLAttributes } from "react";

export const route = { id: "", pushed: [] as string[] };

export const navigationMock = {
  useParams: () => ({ id: route.id }),
  useRouter: () => ({ push: (href: string) => route.pushed.push(href) }),
};

export function LinkMock({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}

export function ImageMock(props: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) {
  const { priority: _priority, alt = "", ...rest } = props;
  void _priority;
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} {...rest} />;
}
