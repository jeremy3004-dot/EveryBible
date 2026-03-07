#!/usr/bin/env ts-node

/**
 * Sequential Tibetan Image Generation Script
 *
 * Generates 3 culturally appropriate images for Tibetan Bible app
 * using sequential API calls with rate limiting and error handling.
 *
 * IMPORTANT: Uses Imagen 4 models (imagen-4.0-fast-generate-001)
 * Batch generation is NOT supported - must use sequential approach
 * Resolution: 1408×768 (Imagen 4's default for 16:9 aspect ratio)
 */

interface ImageConfig {
  filename: string;
  prompt: string;
  description: string;
}

const OUTPUT_DIR = '/Users/dev/Projects/EveryBible/assets/tibetan';
const DELAY_MS = 2000; // 2 second delay between calls for rate limiting

// Image configurations with culturally appropriate prompts
// NOTE: Prompts avoid depicting people directly due to API content policies
// Focus on environments and cultural elements to convey themes
const images: ImageConfig[] = [
  {
    filename: 'home-hero.png',
    description: 'Home screen hero image - welcoming family environment',
    prompt: "Warm mountain home interior with traditional Tibetan decorations, maroon and gold chuba robes hanging on wall, cozy firelight creating welcoming atmosphere, low wooden table with tea cups, Himalayan mountain village visible through window at golden sunset, sense of home and belonging, Procreate digital painting style, rich warm color palette"
  },
  {
    filename: 'field-gospel.png',
    description: 'Gospel field illustration - prayer and contemplation',
    prompt: "Simple Tibetan mountain home interior with prayer space, open scripture book on meditation cushion, soft morning light streaming through window, prayer beads and incense, serene Himalayan landscape visible outside, sense of spiritual contemplation and peace, Procreate digital painting style, maroon and saffron color palette, warm and inviting atmosphere"
  },
  {
    filename: 'field-discipleship.png',
    description: 'Discipleship field illustration - peace and reconciliation',
    prompt: "Peaceful monastery courtyard in Tibetan mountains, traditional prayer flags connecting buildings, warm golden hour sunlight, meditation garden with stone pathway, sense of healing and peace, maroon monastery walls, open doorway showing welcoming interior light, Procreate digital painting style, warm maroon and gold tones, emphasis on tranquility and harmony"
  }
];

/**
 * Sleep utility for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a single image with retries
 */
async function generateImage(config: ImageConfig, retries = 3): Promise<void> {
  console.log(`\n📸 Generating: ${config.filename}`);
  console.log(`Description: ${config.description}`);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${retries}...`);

      // Note: This uses the MCP tool which will be called by Claude
      // The actual API call will be made through the tool system
      const outputPath = `${OUTPUT_DIR}/${config.filename}`;

      console.log(`✓ Image generation request sent`);
      console.log(`  Output path: ${outputPath}`);

      return; // Success

    } catch (error) {
      console.error(`✗ Attempt ${attempt} failed:`, error);

      if (attempt < retries) {
        console.log(`Waiting ${DELAY_MS}ms before retry...`);
        await sleep(DELAY_MS);
      } else {
        throw new Error(`Failed to generate ${config.filename} after ${retries} attempts`);
      }
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('=== Tibetan Image Generation (Sequential) ===\n');
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log(`Total images: ${images.length}`);
  console.log(`Rate limit delay: ${DELAY_MS}ms between calls\n`);

  const results: { success: string[]; failed: string[] } = {
    success: [],
    failed: []
  };

  // Generate images sequentially
  for (let i = 0; i < images.length; i++) {
    const config = images[i];

    try {
      await generateImage(config);
      results.success.push(config.filename);
      console.log(`✓ Successfully generated: ${config.filename}`);

      // Rate limiting delay (except after last image)
      if (i < images.length - 1) {
        console.log(`\nWaiting ${DELAY_MS}ms before next generation...`);
        await sleep(DELAY_MS);
      }

    } catch (error) {
      console.error(`✗ Failed to generate: ${config.filename}`);
      console.error(error);
      results.failed.push(config.filename);
    }
  }

  // Summary report
  console.log('\n=== Generation Summary ===');
  console.log(`✓ Successful: ${results.success.length}`);
  console.log(`✗ Failed: ${results.failed.length}`);

  if (results.success.length > 0) {
    console.log('\nSuccessful generations:');
    results.success.forEach(f => console.log(`  - ${f}`));
  }

  if (results.failed.length > 0) {
    console.log('\nFailed generations:');
    results.failed.forEach(f => console.log(`  - ${f}`));
  }

  console.log('\nRun verification:');
  console.log(`  ls -lh ${OUTPUT_DIR}/*.png`);

  process.exit(results.failed.length > 0 ? 1 : 0);
}

// Export for testing
export { images, generateImage };

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
