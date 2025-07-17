# Neturely

Web deployment file repository for addiapp.com

Clone the repository using the command below:

```console
you@console:~$ git clone git@addiapp.github.com:2b9sa2owa/neturely.git
```

This repository hosts the static resources and configuration used to deploy the Neturely site. Any commits pushed to the **main** branch automatically trigger the deployment workflow defined in `.github/workflows/deploy.yml`.

## Deployment

The workflow synchronizes files to the production server using the FTP-Deploy-Action. Deployment credentials are stored in the `FTPUSERNAME` and `FTPPASSWORD` secrets.

## Contributing

Pull requests and issues are welcome. If you spot a problem or have a suggestion, feel free to open a discussion.
