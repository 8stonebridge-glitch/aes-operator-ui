import { NextResponse } from "next/server";
import { GET as statusCheck } from "../status/route";

// "Load All Services" just re-runs the status checks.
// In the future this could trigger connection retries or warm-up calls.
export async function POST() {
  return statusCheck();
}
