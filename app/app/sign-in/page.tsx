import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";
import RouteFx from "@/components/RouteFx";
import { AuthSkeleton } from "@/components/Skeletons";

export default function SignInPage() {
  return (
    <Suspense fallback={<RouteFx enter={null}><AuthSkeleton /></RouteFx>}>
      <RouteFx>
        <AuthForm />
      </RouteFx>
    </Suspense>
  );
}
