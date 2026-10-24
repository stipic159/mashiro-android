import { defineBoot } from "#q-app/wrappers";
import { getToken } from "@/api/client";
import { useAuthStore } from "@/stores/auth";

export default defineBoot(async () => {
  const auth = useAuthStore();
  auth.restore();
  if (getToken()) await auth.fetchProfile();
});
