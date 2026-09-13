import { expect, it, vi } from "vitest";
import { startRuntime } from "../../src/app/main.js";
import { startPostgresTestContainer } from "../helpers/postgres.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { ReminderService } from "../../src/domain/reminders/reminder-service.js";
import { createLogger } from "../../src/shared/logger.js";
import { resetReminders, reminderRound, reminderRow, reminderDue, reminderChat } from "../helpers/reminders.js";
function fixture(failure?:string) {
 const order:string[]=[];
 const step=(name:string)=>vi.fn(async()=>{order.push(name);if(name===failure)throw Error(name);});
 const deps={initialize:step("initialize"),queue:{start:step("queue-start"),stopAdmission:vi.fn(()=>order.push("queue-admission")),stop:step("queue-stop")},reminders:{recoverAbandonedReservations:step("recover"),reconcile:step("reconcile"),stopAdmission:vi.fn(()=>order.push("reminder-admission")),stop:step("drain")},startRunner:()=>{order.push("runner-start");if(failure==="runner-start")throw Error("runner-start");return {stop:step("runner-stop")};},disconnect:step("disconnect")};
 return {deps,order};
}
it.each(["initialize","queue-start","recover","reconcile","runner-start"])("closes acquired resources after %s fails",async(failure)=>{
 const {deps,order}=fixture(failure); await expect(startRuntime(deps)).rejects.toThrow(failure); expect(order.slice(-2)).toEqual(["queue-stop","disconnect"]);
});
it("uses current-anchor reply when metadata lookup fails and drains a paused send within its bound",async()=>{
 const db=await startPostgresTestContainer(); const prisma=createPrismaClient(db.databaseUrl);
 let release!:()=>void; const paused=new Promise<void>(r=>release=r);
 let entered!:()=>void; const sending=new Promise<void>(r=>entered=r);
 try {
 await resetReminders(prisma); const round=await reminderRound(prisma); const row=await reminderRow(prisma,round.id);
 const getChat=vi.fn(async()=>{throw Error("unavailable chat");});
 const send=vi.fn(async()=>{entered();await paused;return {messageId:91};});
 const service=new ReminderService({prisma,now:()=>reminderDue,botUserId:9n,logger:createLogger({level:"silent"}),transport:async()=>({messageId:92}),followups:{getChat,send}});
 const work=service.dispatch(row.id); await Promise.race([sending,work]);
 expect(send).toHaveBeenCalledOnce();
 await service.stop(10);
 expect(await prisma.reminderOccurrence.findUnique({where:{id:row.id}})).toMatchObject({disposition:"RESERVED"});
 await service.dispatch(row.id); expect(send).toHaveBeenCalledOnce();
 release();await work;
 await service.dispatch(row.id);expect(send).toHaveBeenCalledOnce();
 } finally {release?.();await prisma.$disconnect();await db.stop();}
},180000);
it("stops admission first and closes queue before database exactly once",async()=>{
 const {deps,order}=fixture(); const runtime=await startRuntime(deps); await Promise.all([runtime.stop(),runtime.stop()]);
 expect(order.slice(-6)).toEqual(["queue-admission","reminder-admission","runner-stop","drain","queue-stop","disconnect"]); expect(deps.disconnect).toHaveBeenCalledTimes(1);
});
it("still closes all resources when runner teardown rejects",async()=>{
 const {deps,order}=fixture("runner-stop"); const runtime=await startRuntime(deps); await expect(runtime.stop()).rejects.toThrow(); expect(order.slice(-3)).toEqual(["drain","queue-stop","disconnect"]);
});
