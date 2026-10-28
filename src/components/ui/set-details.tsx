import type { Tempo } from "@/lib/tempo";

export function SavedSetDetails({tempo,note,setup}:{tempo?:Tempo|null;note?:string|null;setup?:string|null}) {
  return <div className="text-caption text-muted">
    <p>Tempo {tempo?.join("-")??"unspecified"}</p>
    {setup && <TextDetail label="Setup used" text={setup}/>}
    {note && <TextDetail label="Set note" text={note}/>}
  </div>;
}
function TextDetail({label,text}:{label:string;text:string}) {
  return <details className="min-w-0"><summary className="min-h-11 cursor-pointer py-2"><span>{label}</span><span className="line-clamp-1 break-words">{text}</span></summary>
    <p className="whitespace-pre-wrap break-words pb-2 [overflow-wrap:anywhere]">{text}</p></details>;
}
