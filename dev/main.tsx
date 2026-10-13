import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {Titles} from "../client/titles";
const queryClient=new QueryClient();
function App(){const[dark,setDark]=useState(true);const colors=dark?{surface0:"#111513",surface1:"#19201c",surface2:"#28352c",border:"#35473b",foreground:"#f0f5f1",foregroundMuted:"#adbbaf"}:{surface0:"#fafcf9",surface1:"#ffffff",surface2:"#e6efe7",border:"#cbd7cc",foreground:"#16231a",foregroundMuted:"#526756"};return <QueryClientProvider client={queryClient}><div style={{background:colors.surface0,color:colors.foreground,padding:12}}><button onClick={()=>setDark(!dark)}>Switch theme</button> Component render check · fixture data</div><Titles {...({theme:{colors},layout:{compact:innerWidth<700}} as any)}/></QueryClientProvider>;}
createRoot(document.getElementById("root")!).render(<App/>);
