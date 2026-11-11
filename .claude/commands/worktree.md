---
description: Crea un git worktree en .trees/<nombre> y ejecuta el requerimiento ahí, aislado del código principal
argument-hint: <requerimiento a implementar>
allowed-tools: Bash(git worktree:*), Bash(git branch:*), Bash(git status:*), Bash(git rev-parse:*), Bash(mkdir:*), Bash(ls:*), Read, Edit, Write, Glob, Grep
---

# /worktree

Requerimiento del usuario:

<requerimiento>
$ARGUMENTS
</requerimiento>

## Pasos

1. **Validar entrada.** Si el requerimiento está vacío, pide al usuario que lo describa y detente.

2. **Elegir el nombre.** Deriva un nombre corto a partir del requerimiento:
   - kebab-case, minúsculas, solo `a-z`, `0-9` y `-`, sin tildes ni `ñ`.
   - 2 a 4 palabras, máximo 40 caracteres.
   - Prefijo según el tipo: `feat-`, `fix-`, `refactor-`, `docs-` o `chore-`.
   - Ejemplo: "agregar sonido al limpiar líneas" → `feat-sonido-lineas`.

3. **Evitar colisiones.** Comprueba con `git worktree list` y `git branch --list <nombre>` que no exista ya. Si existe, agrega un sufijo `-2`, `-3`, etc.

4. **Crear el worktree** desde la raíz del repo (`git rev-parse --show-toplevel`):

   ```bash
   git worktree add .trees/<nombre> -b <nombre>
   ```

   Confirma que `.trees/` esté en `.gitignore`. Si no está, agrégalo.

5. **Trabajar solo dentro del worktree.**
   - Ruta de trabajo: `<raíz>/.trees/<nombre>`. Usa rutas absolutas bajo esa carpeta en todas las lecturas, búsquedas y ediciones.
   - En comandos de shell, usa `git -C <raíz>/.trees/<nombre> ...` o `cd` a esa carpeta en el mismo comando.
   - **Nunca** modifiques archivos fuera de `.trees/<nombre>`. El código principal no se toca.
   - Sigue las convenciones de `CLAUDE.md`.

6. **Implementar el requerimiento** completo dentro del worktree.

7. **No hagas commit, push ni merge** salvo que el requerimiento lo pida explícitamente.

8. **Reportar al final:**
   - Nombre del worktree y rama.
   - Ruta: `.trees/<nombre>`.
   - Archivos modificados (`git -C .trees/<nombre> status --short`).
   - Cómo probarlo: `cd .trees/<nombre> && python3 -m http.server 8000`.
   - Cómo integrarlo o descartarlo:
     - `git merge <nombre>` desde la rama principal.
     - `git worktree remove .trees/<nombre> && git branch -D <nombre>`.
