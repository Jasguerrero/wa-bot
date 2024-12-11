const axios = require('axios');
const handleTibiaResponse = require('../../tibia/responses');
const mockData = require('./mockData.json'); // Import mock data

jest.mock('axios');

describe('handleTibiaResponse', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should return commands list for !commands', async () => {
    const message = '!commands';
    const response = await handleTibiaResponse(message);

    expect(response).toBe(
      'Comandos: \n!house {world} {city} (ejemplo: !house pacera thais)\n!boss\n'
    );
  });

  test('should fetch house details for !house command', async () => {
    const message = '!house World City';

    axios.get.mockResolvedValue(mockData.housesResponse);

    const response = await handleTibiaResponse(message);

    expect(response).toContain('Auctioned Houses in City, World:');
    expect(response).toContain('Name: House A');
    expect(response).toContain('Rent: 1000 gold');
    expect(response).toContain('Current Bid: 5000');
    expect(response).toContain('Time Left: 5d')
  });

  test('should return no auctioned houses for !house if none are found', async () => {
    const message = '!house pacera thais';

    axios.get.mockResolvedValue(mockData.housesEmptyResponse);

    const response = await handleTibiaResponse(message);

    expect(response).toBe('No auctioned houses found in thais, pacera.');
  });

  test('should fetch boosted boss details for !boss command', async () => {
    const message = '!boss';

    axios.get.mockResolvedValue(mockData.boostedBossResponse);

    const response = await handleTibiaResponse(message);

    expect(response).toBe('Boosted boss: Demon');
  });

  test('should handle error gracefully for !house command', async () => {
    const message = '!house pacera thais';

    axios.get.mockRejectedValue(new Error('Network Error'));

    const response = await handleTibiaResponse(message);

    expect(response).toBe('Error: pacera and thais not found.');
  });

  test('should handle error gracefully for !boss command', async () => {
    const message = '!boss';

    axios.get.mockRejectedValue(new Error('Network Error'));

    const response = await handleTibiaResponse(message);

    expect(response).toBe('Error');
  });

  test('should return an empty string for invalid command', async () => {
    const message = '!invalidcommand';
    const response = await handleTibiaResponse(message);

    expect(response).toBe('');
  });
});
