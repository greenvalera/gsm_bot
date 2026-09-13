import { expect, it, vi } from "vitest";
import { startRuntime } from "../../src/app/main.js";
function fixture(failure?:string) {
 const order:string[]=[];
 const step=(name:string)=>vi.fn(async()=>{order.push(name);if(name===failure)throw Error(name);});
 const deps={initialize:step("initialize"),queue:{start:step("queue-start"),stopAdmission:vi.fn(()=>order.push("queue-admission")),stop:step("queue-stop")},reminders:{recoverAbandonedReservations:step("recover"),reconcile:step("reconcile"),stopAdmission:vi.fn(()=>order.push("reminder-admission")),stop:step("drain")},startRunner:()=>{order.push("runner-start");if(failure==="runner-start")throw Error("runner-start");return {stop:step("runner-stop")};},disconnect:step("disconnect")};
 return {deps,order};
}
it.each(["initialize","queue-start","recover","reconcile","runner-start"])("closes acquired resources after %s fails",async(failure)=>{
 const {deps,order}=fixture(failure); await expect(startRuntime(deps)).rejects.toThrow(failure); expect(order.slice(-2)).toEqual(["queue-stop","disconnect"]);
});
it("stops admission first and closes queue before database exactly once",async()=>{
 const {deps,order}=fixture(); const runtime=await startRuntime(deps); await Promise.all([runtime.stop(),runtime.stop()]);
 expect(order.slice(-6)).toEqual(["queue-admission","reminder-admission","runner-stop","drain","queue-stop","disconnect"]); expect(deps.disconnect).toHaveBeenCalledTimes(1);
});
it("still closes all resources when runner teardown rejects",async()=>{
 const {deps,order}=fixture("runner-stop"); const runtime=await startRuntime(deps); await expect(runtime.stop()).rejects.toThrow(); expect(order.slice(-3)).toEqual(["drain","queue-stop","disconnect"]);
});
