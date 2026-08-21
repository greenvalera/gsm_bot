-- Keep removal callbacks in a dedicated, server-side action namespace.
ALTER TYPE "CallbackActionKind" ADD VALUE 'ROSTER_REMOVE';
