<script lang="ts">
  let message = $state('Hello from SvelteKit + Tauri!');
</script>

<svelte:head>
  <title>Outline</title>
</svelte:head>

<main>
  <h1>{message}</h1>
  <p>The Tauri app is working.</p>
</main>

<style>
  main {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    padding: 2rem;
    text-align: center;
  }
  h1 {
    color: #333;
  }
</style>
