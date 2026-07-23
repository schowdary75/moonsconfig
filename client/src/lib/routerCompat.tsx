import type { ComponentType, ReactNode } from 'react';
import {
  Link as ReactRouterLink,
  Outlet,
  useLoaderData,
  useLocation,
  useNavigate as useReactRouterNavigate,
  useParams,
  type LinkProps as ReactRouterLinkProps,
} from 'react-router';

type NavigateOptions = {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  replace?: boolean;
};

function destination({ to, params, search }: NavigateOptions) {
  let pathname = to;
  for (const [key, value] of Object.entries(params ?? {})) {
    pathname = pathname.replace(`$${key}`, encodeURIComponent(value));
  }
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search ?? {})) {
    if (value !== undefined && value !== null) query.set(key, String(value));
  }
  const suffix = query.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}

export function useNavigate() {
  const navigate = useReactRouterNavigate();
  return (options: NavigateOptions | string | number) => {
    if (typeof options === 'number') return navigate(options);
    if (typeof options === 'string') return navigate(options);
    return navigate(destination(options), { replace: options.replace });
  };
}

type RouteOptions = {
  component?: ComponentType<any>;
  loader?: (...args: any[]) => unknown;
  pendingComponent?: ComponentType<any>;
  errorComponent?: ComponentType<any>;
  [key: string]: unknown;
};

export function createFileRoute(_path: string) {
  return (options: RouteOptions) => ({
    options,
    useParams: () => useParams() as any,
    useNavigate,
    useLoaderData: () => useLoaderData() as any,
  });
}

type CompatLinkProps = Omit<ReactRouterLinkProps, 'to'> & {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  children?: ReactNode;
};

export function Link({ to, params, search, ...props }: CompatLinkProps) {
  return <ReactRouterLink to={destination({ to, params, search })} {...props} />;
}

export { Outlet };
export { useLocation };
