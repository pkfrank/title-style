import {defineConfig} from 'vite';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({root:dir,resolve:{alias:[{find:/^react-native$/,replacement:'react-native-web'},{find:/^@getpaseo\/plugin\/client$/,replacement:path.join(dir,'plugin-mock.ts')}]},server:{host:'127.0.0.1',port:4178,strictPort:true},build:{outDir:path.join(dir,'build'),emptyOutDir:true}});
